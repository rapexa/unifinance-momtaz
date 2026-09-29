// Command license manages customer license keys (vendor side).
//
//	license keygen  -dir ./keys
//	license issue   -priv ./keys/license-private.key -customer "..." -plan pro \
//	                -students 300 -users 15 -months 12 [-start 2026-10-01] [-domain x.ir]
//	license inspect -pub ./keys/license-public.key <key>
//	license check   -priv ./keys/license-private.key   (does it match this build's public key?)
package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/pkg/license"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	switch os.Args[1] {
	case "keygen":
		keygen(os.Args[2:])
	case "issue":
		issue(os.Args[2:])
	case "inspect":
		inspect(os.Args[2:])
	case "check":
		check(os.Args[2:])
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage:
  license keygen  -dir ./keys
  license issue   -priv keys/license-private.key -customer NAME -plan PLAN -students N -users N -months N [-start YYYY-MM-DD] [-domain DOMAIN]
  license inspect -pub keys/license-public.key KEY
  license check   -priv keys/license-private.key`)
	os.Exit(2)
}

func fail(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "error: "+format+"\n", a...)
	os.Exit(1)
}

func keygen(args []string) {
	fs := flag.NewFlagSet("keygen", flag.ExitOnError)
	dir := fs.String("dir", "keys", "output directory")
	force := fs.Bool("force", false, "overwrite an existing key pair")
	_ = fs.Parse(args)
	privPath := filepath.Join(*dir, "license-private.key")
	pubPath := filepath.Join(*dir, "license-public.key")
	if _, err := os.Stat(privPath); err == nil && !*force {
		fail("%s already exists (use -force to replace it; old licenses will stop verifying)", privPath)
	}
	pub, priv, err := license.GenerateKeyPair()
	if err != nil {
		fail("%v", err)
	}
	if err := os.MkdirAll(*dir, 0o700); err != nil {
		fail("%v", err)
	}
	if err := os.WriteFile(privPath, []byte(priv+"\n"), 0o600); err != nil {
		fail("%v", err)
	}
	if err := os.WriteFile(pubPath, []byte(pub+"\n"), 0o644); err != nil {
		fail("%v", err)
	}
	fmt.Printf("private key: %s  (keep it secret, back it up)\npublic key:  %s\n", privPath, pubPath)
}

func issue(args []string) {
	fs := flag.NewFlagSet("issue", flag.ExitOnError)
	privPath := fs.String("priv", "keys/license-private.key", "private key file")
	customer := fs.String("customer", "", "customer name")
	plan := fs.String("plan", "pro", "plan code")
	students := fs.Int("students", 0, "max active students (0 = unlimited)")
	users := fs.Int("users", 0, "max active users (0 = unlimited)")
	months := fs.Int("months", 12, "duration in months")
	days := fs.Int("days", 0, "extra days (e.g. a 14-day trial: -months 0 -days 14)")
	start := fs.String("start", "", "start date YYYY-MM-DD (default: today)")
	domain := fs.String("domain", "", "customer domain(s), comma separated")
	_ = fs.Parse(args)
	if strings.TrimSpace(*customer) == "" {
		fail("-customer is required")
	}
	raw, err := os.ReadFile(*privPath)
	if err != nil {
		fail("read private key: %v", err)
	}
	priv, err := license.DecodePrivateKey(string(raw))
	if err != nil {
		fail("%v", err)
	}
	if !matchesBuild(priv) {
		fail("this private key does not match the public key built into the app — licenses would be rejected")
	}
	from := time.Now()
	if *start != "" {
		if from, err = time.ParseInLocation("2006-01-02", *start, time.Local); err != nil {
			fail("bad -start: %v", err)
		}
	}
	exp := from.AddDate(0, *months, *days)
	if !exp.After(from) {
		fail("duration must be positive")
	}
	id := make([]byte, 4)
	_, _ = rand.Read(id)
	c := license.Claims{
		ID:          "UF-" + strings.ToUpper(hex.EncodeToString(id)),
		Customer:    strings.TrimSpace(*customer),
		Plan:        strings.TrimSpace(*plan),
		MaxStudents: *students,
		MaxUsers:    *users,
		IssuedAt:    time.Now().UTC().Truncate(time.Second),
		ExpiresAt:   exp.UTC().Truncate(time.Second),
	}
	for _, d := range strings.Split(*domain, ",") {
		if d = strings.TrimSpace(d); d != "" {
			c.Domains = append(c.Domains, d)
		}
	}
	key, err := license.Sign(priv, c)
	if err != nil {
		fail("%v", err)
	}
	fmt.Fprintf(os.Stderr, "license %s for %q (%s) until %s\n", c.ID, c.Customer, c.Plan, c.ExpiresAt.Format("2006-01-02"))
	fmt.Println(key)
}

func inspect(args []string) {
	fs := flag.NewFlagSet("inspect", flag.ExitOnError)
	pubPath := fs.String("pub", "keys/license-public.key", "public key file")
	_ = fs.Parse(args)
	if fs.NArg() < 1 {
		fail("missing key")
	}
	raw, err := os.ReadFile(*pubPath)
	if err != nil {
		fail("read public key: %v", err)
	}
	pub, err := license.DecodePublicKey(string(raw))
	if err != nil {
		fail("%v", err)
	}
	c, err := license.Parse(fs.Arg(0), pub)
	if err != nil {
		fail("%v", err)
	}
	fmt.Printf("id:        %s\ncustomer:  %s\nplan:      %s\nstudents:  %d\nusers:     %d\nissued:    %s\nexpires:   %s\ndomains:   %s\n",
		c.ID, c.Customer, c.Plan, c.MaxStudents, c.MaxUsers,
		c.IssuedAt.Format(time.RFC3339), c.ExpiresAt.Format(time.RFC3339), strings.Join(c.Domains, ", "))
}

// matchesBuild reports whether priv belongs to the public key compiled into this build.
func matchesBuild(priv ed25519.PrivateKey) bool {
	pub, err := license.CompiledPublicKey()
	if err != nil {
		return false
	}
	return bytes.Equal(priv.Public().(ed25519.PublicKey), pub)
}

func check(args []string) {
	fs := flag.NewFlagSet("check", flag.ExitOnError)
	privPath := fs.String("priv", "keys/license-private.key", "private key file")
	_ = fs.Parse(args)
	raw, err := os.ReadFile(*privPath)
	if err != nil {
		fail("read private key: %v", err)
	}
	priv, err := license.DecodePrivateKey(string(raw))
	if err != nil {
		fail("%v", err)
	}
	if !matchesBuild(priv) {
		fail("private key does NOT match this build's public key")
	}
	fmt.Println("ok: private key matches this build")
}
