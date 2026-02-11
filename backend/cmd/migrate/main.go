package main

import "github.com/soheilsshh/unifinance-momtaz/migrations"

// main for the "migrate" command.
// This keeps all executable entrypoints under cmd/ while migrations
// remain a reusable package.
func main() {
	migrations.Run()
}

