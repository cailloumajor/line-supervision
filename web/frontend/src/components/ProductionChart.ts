import type { ApexOptions } from "apexcharts"
import type { Dayjs } from "dayjs"

import {
  flux,
  fluxDuration,
  fluxExpression,
} from "@influxdata/influxdb-client-browser"
import { computed, defineComponent, reactive } from "@vue/composition-api"
import dayjs from "dayjs"

import useInfluxDB from "@/composables/influxdb"
import useInfluxChart from "@/composables/influx-chart"
import useUiConfigStore from "@/stores/ui-config"
import useOpcUaStore from "@/stores/opcua"

type Point = [string, number | null]

interface DataSerie {
  name: string
  data: Point[]
}

export default defineComponent({
  setup() {
    const { influxDB } = useInfluxDB()
    const uiConfig = useUiConfigStore()
    const opcUaStore = useOpcUaStore()

    const machines = uiConfig.machines.filter((machine) => machine.production)
    const machineSet = machines.map((machine) => machine.index.toString())
    const serieName = machines.map((machine) => machine.name).join(" + ")

    const timeRange = reactive({
      start: dayjs(),
      end: dayjs(),
    })

    function updateTimeRange() {
      const shiftsEnds = Array<Dayjs>(4).fill(dayjs())
      const currentShiftEnd = shiftsEnds
        .map((shiftEnd, index) =>
          shiftEnd
            .hour(5)
            .minute(30)
            .second(0)
            .millisecond(0)
            .add(8 * index, "hour")
        )
        .find((shiftEnd) => dayjs().isBefore(shiftEnd)) as Dayjs
      timeRange.start = currentShiftEnd.subtract(8, "hour")
      timeRange.end = currentShiftEnd
    }

    return useInfluxChart<DataSerie[]>({
      influxDB,

      queryInterval: 60000,

      generateQuery: (dbName) => {
        updateTimeRange()
        const windowOffset = fluxDuration(`${timeRange.start.minute()}m`)
        const machineColumns = machines.map(
          (machine) => `machine${machine.index}`
        )
        const machineSum = fluxExpression(
          machineColumns.map((mc) => `r.${mc}`).join(" + ")
        )
        return flux`\
          from(bucket: "${dbName}")
            |> range(start: ${timeRange.start.toDate()})
            |> filter(fn: (r) =>
              r._measurement == "dbLineSupervision.machine" and
              r._field == "counters.production" and
              contains(value: r.machine_index, set: ${machineSet})
            )
            |> map(fn: (r) => ({ r with machine_index: "machine" + r.machine_index }))
            |> pivot(columnKey: ["machine_index"], rowKey: ["_time"], valueColumn: "_value")
            |> window(every: 1h, offset: ${windowOffset})
            |> increase(columns: ${machineColumns})
            |> top(n: 1, columns: ["_time"])
            |> map(fn: (r) => ({ r with total: ${machineSum} }))
        `
      },

      seed: [{ name: serieName, data: [] }],

      reducer: (acc, value) => {
        const currentData = acc.find(({ name }) => name === serieName)?.data
        return [
          {
            name: serieName,
            data: [
              ...(currentData as Point[]),
              [value._start, value.total],
              [value._time, value.total],
            ],
          },
        ]
      },

      chartType: "line",

      chartOptions: computed<ApexOptions>(() => ({
        annotations: {
          position: "back",
          yaxis: [
            {
              borderColor: "#FF4560",
              borderWidth: 2,
              label: {
                offsetY: -10,
                style: {
                  background: "#FF4560",
                },
                text: "Objectif / heure",
              },
              strokeDashArray: 0,
              y: opcUaStore.lineGlobalParameters.productionObjective,
            },
          ],
        },
        colors: ["#008FFB"],
        dataLabels: {
          enabled: false,
        },
        grid: {
          xaxis: {
            lines: {
              show: true,
            },
          },
        },
        legend: {
          showForSingleSeries: true,
        },
        markers: {
          showNullDataPoints: false,
        },
        stroke: {
          curve: "stepline",
          width: 3,
        },
        title: {
          text: "Production",
        },
        xaxis: {
          labels: {
            datetimeUTC: false,
            formatter: (value) => dayjs(value).format("HH:mm"),
            minHeight: 45,
            offsetY: 5,
            rotateAlways: true,
          },
          max: timeRange.end.valueOf(),
          min: timeRange.start.valueOf(),
          tickAmount: 8,
          type: "datetime",
        },
        yaxis: {
          forceNiceScale: true,
          max: (max) =>
            Math.max(opcUaStore.lineGlobalParameters.productionObjective, max),
          min: 0,
        },
      })),
    })
  },
})
