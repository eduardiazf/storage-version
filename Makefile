test:
	npm test

test-watch:
	node --test --watch test/*.test.js

.PHONY: test test-watch
