package jalali

import "testing"

func TestFromGregorian(t *testing.T) {
	cases := []struct {
		gy, gm, gd    int
		wantY, wantM  int
	}{
		{2024, 3, 20, 1403, 1},
		{2025, 3, 21, 1404, 1},
		{2024, 3, 19, 1402, 12},
	}
	for _, c := range cases {
		got := FromGregorian(c.gy, c.gm, c.gd)
		if got.Year != c.wantY || got.Month != c.wantM {
			t.Fatalf("Gregorian %d-%d-%d => %+v want %d/%d", c.gy, c.gm, c.gd, got, c.wantY, c.wantM)
		}
	}
}
