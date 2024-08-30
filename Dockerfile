# ---- Base Node ----
  FROM node:16-bullseye as core

  # Install latest chrome dev package and fonts to support major charsets
  RUN apt-get update \
      && apt-get install -y wget gnupg fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
      && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
      && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
      && apt-get update \
      && apt-get install -y google-chrome-stable \
      && rm -rf /var/lib/apt/lists/*
  
  COPY ./docker/files/usr/local/bin/entrypoint /usr/local/bin/entrypoint
  
  # Give the "root" group the same permissions as the "root" user on /etc/passwd
  RUN chmod g=u /etc/passwd
  
  ENTRYPOINT ["/usr/local/bin/entrypoint"]
  
  # Un-privileged user running the application
  ARG DOCKER_USER=1000
  USER ${DOCKER_USER}
  
  # Install Puppeteer dependencies and avoid Chromium download
  ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
  
  # Install Puppeteer
  RUN npm install puppeteer --unsafe-perm=true
  
  # ---- Image to publish ----
  FROM core as dist
  
  COPY . /app/
  WORKDIR /app/
  
  RUN yarn install --frozen-lockfile
  
  CMD ["./cli.js", "stress"]
  