FROM nginx:1.27-alpine
COPY index.html config.js /usr/share/nginx/html/
EXPOSE 80
