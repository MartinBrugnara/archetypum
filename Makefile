.PHONY: build, dist, lint, install

SHELL=/bin/bash -O extglob 

build: dist clean 
	cat ./src/!(main).ts ./src/main.ts > ./src/archetypum.ts
	tsc -p tsconfig.json
	cp ./src/index.html ./dist/

lint:
	tslint --type-check --project ./src/

dist:
	mkdir -p dist

install:
	npm install -g typescript
	npm install -g tslint

clean:
	rm -f ./src/archetypum.ts
	rm -rf dist/*.{js,map}
