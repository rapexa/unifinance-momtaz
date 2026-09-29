package services

import "testing"

func TestNormalizeIranMobile(t *testing.T) {
	cases := map[string]string{
		"09121234567":    "09121234567",
		"۰۹۱۲ ۱۲۳ ۴۵۶۷":  "09121234567",
		"+989121234567":  "09121234567",
		"00989121234567": "09121234567",
		"9121234567":     "09121234567",
		"0912-123-4567":  "09121234567",
		"02188888888":    "",
		"0912123456":     "",
		"":               "",
	}
	for in, want := range cases {
		if got := NormalizeIranMobile(in); got != want {
			t.Errorf("NormalizeIranMobile(%q) = %q, want %q", in, got, want)
		}
	}
}
