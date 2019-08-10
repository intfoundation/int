RUN mkdir -p /home/nodeapp

ADD . /home/nodeapp
WORKDIR /home/nodeapp

EXPOSE 8555

CMD  ["node","./src/tool/startDPeer.js","--main","--loggerLevel","info"]