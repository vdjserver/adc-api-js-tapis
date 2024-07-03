# Base Image
FROM ubuntu:22.04

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
    git \
    wget \
    supervisor

##################
##################

# setup vdj user
RUN echo "vdj:x:816290:803419:VDJServer,,,:/home/vdj:/bin/bash" >> /etc/passwd
RUN echo "G-803419:x:803419:vdj" >> /etc/group
RUN mkdir /home/vdj
RUN chown vdj /home/vdj
RUN chgrp G-803419 /home/vdj

##################
##################

# node
ENV NODE_VER v18.17.1
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

# Copy project source
RUN mkdir /adc-api-js-tapis
COPY . /adc-api-js-tapis
RUN cd /adc-api-js-tapis && npm install

# Setup supervisor
COPY docker/supervisor/supervisor.conf /etc/supervisor/conf.d/

# ESLint
RUN cd /adc-api-js-tapis && ls && npm run eslint app/api app/vdj-tapis-js

# Copy AIRR spec
RUN cp /adc-api-js-tapis/app/vdjserver-schema/airr-standards/specs/adc-api-openapi3.yaml /adc-api-js-tapis/app/api/swagger/adc-api-openapi3.yaml
RUN cp /adc-api-js-tapis/app/vdjserver-schema/airr-standards/specs/airr-schema-openapi3.yaml /adc-api-js-tapis/app/config/airr-schema-openapi3.yaml

CMD ["bash", "/adc-api-js-tapis/docker/scripts/vdjserver-adc-api.sh"]
