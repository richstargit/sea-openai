FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg fonts-liberation fonts-noto-core fonts-thai-tlwg ca-certificates curl poppler-utils python3 && rm -rf /var/lib/apt/lists/*
RUN npm install --global hyperframes@0.9.75 && npm cache clean --force
RUN mkdir -p /opt/video/fonts && cd /opt/video/fonts && for weight in Medium ExtraBold; do curl -fsSL --retry 2 "https://raw.githubusercontent.com/google/fonts/main/ofl/kanit/Kanit-${weight}.ttf" -o "Kanit-${weight}.ttf"; done && curl -fsSL https://raw.githubusercontent.com/google/fonts/main/ofl/kanit/OFL.txt -o OFL.txt
RUN cd /opt/video && npm install --no-save three@0.181.2 esbuild@0.25.12 && printf '%s' 'export * from "three";export {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";export {RoomEnvironment} from "three/addons/environments/RoomEnvironment.js"' > entry.js && ./node_modules/.bin/esbuild entry.js --bundle --minify --format=esm --outfile=three.js && rm -rf node_modules entry.js && npm cache clean --force
RUN cd /tmp && HYPERFRAMES_NO_TELEMETRY=1 hyperframes catalog --json > /opt/video/catalog.json && node -e "if(!JSON.parse(require('fs').readFileSync('/opt/video/catalog.json')).length)throw Error('Empty catalog')"
ENV HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium HYPERFRAMES_NO_TELEMETRY=1 PRODUCER_ALLOW_SOFTWARE_WEBGPU=true
RUN mkdir -p /home/node/workspace && chown node:node /home/node/workspace
USER node
WORKDIR /home/node/workspace
