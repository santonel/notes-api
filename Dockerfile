FROM node:22-alpine AS build

WORKDIR  /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-alpine

ENV NODE_ENV=production
USER node

# Set working directory
WORKDIR /app
RUN mkdir -p /app/data && chown node:node -R /app/data && chmod 770 /app/data

COPY package*.json ./
COPY *BUILD_INFO ./

RUN npm ci --omit=dev

# Copy only necessary files from the build phase
COPY --from=build /app/dist ./dist


EXPOSE 4000
CMD ["node", "dist/src/index.js"]