# shellcheck shell=bash

$INFLUX_CMD "CREATE DATABASE $INFLUX_DB_NAME WITH DURATION $INFLUX_RP_DURATION"
