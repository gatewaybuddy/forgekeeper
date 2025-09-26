FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG BACKEND_URL=""
ENV VITE_BACKEND_URL=${BACKEND_URL}
RUN npm run build

FROM nginx:alpine
ARG BACKEND_URL=""
ENV BACKEND_URL=${BACKEND_URL}
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE ${FRONTEND_PORT}
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
