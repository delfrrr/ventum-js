SERVICES = $(shell ls services)
VENTUM = `node -e "require.resolve('ventum').replace(/\/ventum\/.*/g,'/ventum/')" -p`
BUILDER = $(VENTUM)services/bem-builder/bem-builder.js
development: clean
	$(foreach FOLDER, $(SERVICES), $(shell ln -s services/$(FOLDER)/conf/develop services/$(FOLDER)/conf/current))
	mkdir -p www/static/maplos
	node $(BUILDER) -l blocks/ -l services/maplos/blocks/ -n client -d
production: clean
	node $(BUILDER) -l blocks/ -l services/maplos/blocks/ -o www/static/maplos -n client 
clean: 
	rm -f www/static/maplos/*
	rm -f `find . -name '*.include.*'`
jslint:
	@echo "jslint node files"
	@jslint `find libs/ -name '*.js' | grep -v bem.js | grep -v 'test.js'` --profile=node
	@jslint `find libs/ -name '*.test.js' ` --profile=node --predef='describe, it, waitsFor, expect, runs, jasmine'
test:
	@node $(VENTUM)services/tester/tester.js 
