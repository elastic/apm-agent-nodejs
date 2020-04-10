FROM python:3

LABEL maintainer="observability-robots@elastic.co"
COPY . /
WORKDIR /
RUN pip3 install -r requirements.txt
ENTRYPOINT ["/generate.py"]
