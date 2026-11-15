# One-shot tool for docker-compose.yml (service "ca"): creates the studio's own certificate
# authority on the first start, then does nothing (make-ca.sh).
FROM alpine:3.20
RUN apk add --no-cache openssl
COPY make-ca.sh /make-ca.sh
ENTRYPOINT ["sh", "/make-ca.sh"]
