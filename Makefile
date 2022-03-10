make:
	mkdir tmp

clean:
	rm -rf tmp

zip:
	zip -rq pkg.zip .

