# Base Node image with Node.js 18
FROM node:18-bullseye as core

# Install Firefox and necessary fonts
RUN apt-get update \
    && apt-get install -y wget gnupg firefox-esr fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

# Install Yarn only if it is not already installed
RUN if ! command -v yarn > /dev/null; then npm install -g yarn; fi

# Set environment variables to ensure Puppeteer uses Firefox
ENV PUPPETEER_PRODUCT=firefox

# Install Puppeteer
RUN yarn add puppeteer

COPY ./docker/files/usr/local/bin/entrypoint /usr/local/bin/entrypoint

# Give the "root" group the same permissions as the "root" user on /etc/passwd
# to allow a user belonging to the root group to add new users; typically the
# docker user (see entrypoint).
RUN chmod g=u /etc/passwd

# We wrap commands run in this container by the following entrypoint that
# creates a user on-the-fly with the container user ID (see USER) and root group
# ID.
ENTRYPOINT ["/usr/local/bin/entrypoint"]

# Un-privileged user running the application
ARG DOCKER_USER=1000
USER ${DOCKER_USER}

CMD ["firefox"]

# ---- Development image ----
FROM core as development

CMD ["/bin/bash"]

# ---- Image to publish ----
FROM core as dist

# Switch back to the root user to install dependencies
USER root:root

COPY . /app/
WORKDIR /app/

# Install dependencies using Yarn and ensure the Firefox binary is used
RUN yarn install --frozen-lockfile

ARG DOCKER_USER=1000
USER ${DOCKER_USER}

CMD ["./cli.js", "stress"]
