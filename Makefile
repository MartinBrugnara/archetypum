.PHONY: build
build: dist
	tsc -p tsconfig.json

.PHONY: watch
watch: dist
	tsc -w -p tsconfig.json

dist:
	mkdir -p dist
