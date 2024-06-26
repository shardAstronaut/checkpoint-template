include .env

checkpoint-gen:
	yarn checkpoint generate \
		-c src/config.json \
		-s src/schema.gql

# Dev
dev-build: dev-down
	docker compose -f docker-compose.yml build

dev-up: dev-down
	docker compose -f docker-compose.yml up

dev-down:
	docker compose -f docker-compose.yml down -v

.PHONY: checkpoint-gen