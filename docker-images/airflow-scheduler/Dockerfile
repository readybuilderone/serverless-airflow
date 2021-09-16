FROM public.ecr.aws/bitnami/airflow-scheduler:2.1.3
USER root

# Install aws cli
RUN apt-get update -yqq && apt-get install -y unzip
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
RUN unzip awscliv2.zip
RUN ./aws/install

COPY scripts/entrypoint.sh /entrypoint.sh
COPY scripts/sync_dags.sh /sync_dags.sh
COPY requirements.txt /bitnami/python/requirements.txt

USER 1001
ENTRYPOINT [ "/entrypoint.sh" ]
CMD [ "/opt/bitnami/scripts/airflow-scheduler/run.sh" ]
