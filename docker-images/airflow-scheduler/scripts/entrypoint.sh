#!/usr/bin/env bash

# Sync dags from s3 every minute
sh ./sync_dags.sh &

# Run base image entrypoint
exec /opt/bitnami/scripts/airflow-scheduler/entrypoint.sh "$@"
