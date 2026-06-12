package handlers

import (
	"encoding/csv"
	"fmt"
	"net/http"
)

const utf8BOM = "\xef\xbb\xbf"

// writeCSVAttachment streams a UTF-8 CSV with BOM so Excel opens Persian text correctly.
func writeCSVAttachment(w http.ResponseWriter, filename string, header []string, rows [][]string) error {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	if _, err := w.Write([]byte(utf8BOM)); err != nil {
		return err
	}
	cw := csv.NewWriter(w)
	if err := cw.Write(header); err != nil {
		return err
	}
	for _, row := range rows {
		if err := cw.Write(row); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}
