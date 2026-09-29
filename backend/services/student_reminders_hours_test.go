package services

import (
	"testing"
	"time"
)

func TestInSMSSendingHours(t *testing.T) {
	cases := []struct {
		utc  string
		want bool
	}{
		{"2026-09-29T20:59:00Z", false}, // 00:29 Tehran
		{"2026-09-30T05:29:00Z", false}, // 08:59 Tehran
		{"2026-09-30T05:30:00Z", true},  // 09:00 Tehran
		{"2026-09-30T16:29:00Z", true},  // 19:59 Tehran
		{"2026-09-30T16:30:00Z", false}, // 20:00 Tehran
	}
	for _, c := range cases {
		now, _ := time.Parse(time.RFC3339, c.utc)
		if got := InSMSSendingHours(now); got != c.want {
			t.Errorf("%s: got %v want %v", c.utc, got, c.want)
		}
	}
}
