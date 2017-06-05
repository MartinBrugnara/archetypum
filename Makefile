.PHONY: build, dist, lint, install

SHELL=/bin/bash -O extglob 

CSS=`cat ./src/index.css`

build: dist clean 
	cat ./src/!(main).ts ./src/main.ts > ./src/archetypum.ts
	tsc -p tsconfig.json 
	cp ./src/index.html ./dist/
	sed -i.bak -e '/CSS_SOURCE/r ./src/index.css' -e '/CSS_SOURCE/d' ./dist/index.html
	sed -i.bak -e '/JS_SOURCE/r ./dist/archetypum.js' -e '/JS_SOURCE/d' ./dist/index.html

lint:
	tslint --type-check --project ./src/

install:
	npm install -g typescript
	npm install -g tslint

clean:
	rm -f ./src/archetypum.ts
	rm -rf dist/*.{js,map,bak}

demo: build
	mkdir -p demo
	cp -v dist/index.html demo/

