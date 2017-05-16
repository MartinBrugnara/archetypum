.PHONY: build, dist, lint, install

build: dist
	tsc -p tsconfig.json

watch: dist
	tsc -w -p tsconfig.json

lint:
	tslint --type-check --project ./src/

dist:
	mkdir -p dist

install:
	npm install -g typescript
	npm install -g tslint
