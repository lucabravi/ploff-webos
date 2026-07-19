FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends binutils openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @webos-tools/cli@3.2.5 \
    && npm cache clean --force

ENV HOME=/data
WORKDIR /opt/ploff

COPY app ./app
COPY webos-service ./webos-service
COPY webos-shell-app ./webos-shell-app
COPY scripts ./scripts

RUN chmod +x scripts/docker-installer.sh \
    scripts/package-tv-shell.sh \
    scripts/inspect-ipk.sh

VOLUME ["/data"]

ENTRYPOINT ["/opt/ploff/scripts/docker-installer.sh"]
CMD ["install"]
