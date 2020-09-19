# Base Image
FROM ubuntu:18.04

LABEL maintainer="VDJServer <vdjserver@utsouthwestern.edu>"

# PROXY: uncomment these if building behind UTSW proxy
#ENV http_proxy 'http://proxy.swmed.edu:3128/'
#ENV https_proxy 'https://proxy.swmed.edu:3128/'
#ENV HTTP_PROXY 'http://proxy.swmed.edu:3128/'
#ENV HTTPS_PROXY 'https://proxy.swmed.edu:3128/'

# Install OS Dependencies
RUN export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get install -y --fix-missing \
    make \
    wget \
    xz-utils \
    default-jre \
    git \
    python3 \
    python3-pip \
    python3-sphinx \
    python3-scipy \
    libyaml-dev \
    wget \
    supervisor

RUN pip3 install \
    pandas \
    biopython \
    python-dotenv

##################
##################

# not currently using redis and supervisor

# old stuff
#    nodejs \
#    nodejs-legacy \
#    npm \
#    redis-server \
#    redis-tools \
#    sendmail-bin \
#    supervisor \

# Setup postfix
# The postfix install won't respect noninteractivity unless this config is set beforehand.
#RUN mkdir /etc/postfix
#RUN touch /etc/mailname
#COPY docker/postfix/main.cf /etc/postfix/main.cf
#COPY docker/scripts/postfix-config-replace.sh /root/postfix-config-replace.sh

# Debian vociferously complains if you try to install postfix and sendmail at the same time.
#RUN DEBIAN_FRONTEND='noninteractive' apt-get install -y -q --force-yes \
#    postfix

##################
##################

# node
ENV NODE_VER v12.18.3
RUN wget https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-linux-x64.tar.xz
RUN tar xf node-$NODE_VER-linux-x64.tar.xz
RUN cp -rf /node-$NODE_VER-linux-x64/bin/* /usr/bin
RUN cp -rf /node-$NODE_VER-linux-x64/lib/* /usr/lib
RUN cp -rf /node-$NODE_VER-linux-x64/include/* /usr/include
RUN cp -rf /node-$NODE_VER-linux-x64/share/* /usr/share

# PROXY: More UTSW proxy settings
#RUN npm config set proxy http://proxy.swmed.edu:3128
#RUN npm config set https-proxy http://proxy.swmed.edu:3128
#RUN git config --global http.proxy http://proxy.swmed.edu:3128
#RUN git config --global https.proxy https://proxy.swmed.edu:3128

RUN mkdir /api-js-tapis
RUN mkdir /api-js-tapis/app

# Install npm dependencies (optimized for cache)
COPY app/package.json /api-js-tapis/app
RUN cd /api-js-tapis/app && npm install

# Setup redis
#COPY docker/redis/redis.conf /etc/redis/redis.conf

# Setup supervisor
COPY docker/supervisor/supervisor.conf /etc/supervisor/conf.d/

# Copy project source
COPY . /api-js-tapis

# Install the local airr-standards
RUN cd /api-js-tapis/airr-standards/lang/python && python3 setup.py install

# Copy AIRR spec
RUN cp /api-js-tapis/airr-standards/specs/adc-api-openapi3.yaml /api-js-tapis/app/api/swagger/adc-api.yaml
RUN cp /api-js-tapis/airr-standards/specs/airr-schema-openapi3.yaml /api-js-tapis/app/config/airr-schema.yaml

CMD ["bash", "/api-js-tapis/docker/scripts/vdjserver-adc-api.sh"]
