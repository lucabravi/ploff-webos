FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

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
