import {
  FluxTableMetaData,
  HttpError,
  InfluxDB,
  ParameterizedQuery
} from "@influxdata/influxdb-client"
import {
  onMounted,
  onUnmounted,
  ref,
  toRefs,
  watch
} from "@vue/composition-api"
import { from, of, Subject, Subscription, timer } from "rxjs"
import {
  catchError,
  map,
  reduce,
  switchMap,
  switchMapTo,
  tap
} from "rxjs/operators"

import { useInfluxDBStore } from "@/stores/influxdb"
import { LinkStatus } from "@/stores/types"

export type RowObject = ReturnType<FluxTableMetaData["toObject"]>

const url = `http://${window.location.host}/influx`
const queryAPI = new InfluxDB({ url }).getQueryApi("")

export const influxDBName = process.env.VUE_APP_INFLUX_DB_NAME

export function useInfluxDB<T extends Array<unknown>>(
  queryInterval: number,
  query: ParameterizedQuery,
  seed: T,
  reducer: (acc: T, value: RowObject) => T
) {
  let subscription: Subscription

  const influxDBStore = useInfluxDBStore()

  const { linkStatus } = toRefs(influxDBStore.state)
  const influxData = ref(seed)
  const queryError = ref("")

  const query$ = from(queryAPI.rows(query)).pipe(
    tap({
      error: (err: Error) => {
        if (err instanceof HttpError) {
          queryError.value = `${err.statusCode} ${err.statusMessage}`
          if (err.body) {
            queryError.value += `\n${JSON.parse(err.body).error}`
          }
        } else {
          queryError.value = err.message
        }
      },
      complete: () => {
        queryError.value = ""
      }
    }),
    map(({ values, tableMeta }) => tableMeta.toObject(values)),
    reduce(reducer, seed),
    catchError(() => of(seed))
  )

  const linkStatusSubject = new Subject<LinkStatus>()
  const influxData$ = linkStatusSubject.pipe(
    switchMap(status =>
      status === LinkStatus.Up
        ? timer(500, queryInterval).pipe(switchMapTo(query$))
        : of(seed).pipe(
            tap(() => {
              queryError.value = ""
            })
          )
    )
  )

  watch(linkStatus, status => {
    linkStatusSubject.next(status)
  })

  onMounted(() => {
    subscription = influxData$.subscribe({
      next: result => {
        influxData.value = [...result]
      }
    })
  })

  onUnmounted(() => {
    subscription.unsubscribe()
  })

  return {
    influxData,
    queryError
  }
}