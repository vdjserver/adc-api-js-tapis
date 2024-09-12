# Base Image
FROM ubuntu:22.04

LABEL maintainer="VDJServer <vdjserver@utsouthwestern.edu>"

# Install OS Dependencies
RUN export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get install -y --fix-missing \
    make \
    wget \
    xz-utils \
    git \
    wget \
    python3 \
    python3-pip \
    python3-sphinx \
    python3-scipy \
    libyaml-dev \
    curl \
    jq \
    bsdmainutils \
    nano

RUN pip3 install \
    pandas \
    biopython \
    matplotlib \
    airr \
    python-dotenv

RUN pip3 install --upgrade requests

# node
ENV NODE_VER=v18.17.1
RUN wget https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-linux-x64.tar.xz
RUN tar xf node-$NODE_VER-linux-x64.tar.xz
RUN cp -rf /node-$NODE_VER-linux-x64/bin/* /usr/bin
RUN cp -rf /node-$NODE_VER-linux-x64/lib/* /usr/lib
RUN cp -rf /node-$NODE_VER-linux-x64/include/* /usr/include
RUN cp -rf /node-$NODE_VER-linux-x64/share/* /usr/share

# Copy project source
RUN mkdir /conversion
COPY ./conversion/tapis_v2_to_v3 /conversion
RUN mkdir /conversion/vdj-tapis-js
RUN mkdir /conversion/vdjserver-schema
COPY app/vdj-tapis-js /conversion/vdj-tapis-js
COPY app/vdjserver-schema /conversion/vdjserver-schema
RUN cd /conversion && npm install

# ESLint
RUN cd /conversion && npm run eslint *.js

WORKDIR /conversion
