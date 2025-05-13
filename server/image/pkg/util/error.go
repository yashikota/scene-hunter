package util

import (
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/yashikota/scene-hunter/server/image/pkg/model"
)

// ErrorCode はエラーコードを表す
type ErrorCode int

const (
	// ErrorCodeInternal は内部エラーを表す
	ErrorCodeInternal ErrorCode = iota + 1000
	// ErrorCodeInvalidRequest は不正なリクエストを表す
	ErrorCodeInvalidRequest
	// ErrorCodeNotFound はリソースが見つからないことを表す
	ErrorCodeNotFound
	// ErrorCodeUnauthorized は認証エラーを表す
	ErrorCodeUnauthorized
	// ErrorCodeForbidden は権限エラーを表す
	ErrorCodeForbidden
	// ErrorCodeUnsupportedFormat はサポートされていないフォーマットを表す
	ErrorCodeUnsupportedFormat
	// ErrorCodeFileTooLarge はファイルサイズが大きすぎることを表す
	ErrorCodeFileTooLarge
)

// AppError はアプリケーションエラーを表す
type AppError struct {
	Code    ErrorCode
	Message string
	Err     error
}

// Error はエラーメッセージを返す
func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

// Unwrap は元のエラーを返す
func (e *AppError) Unwrap() error {
	return e.Err
}

// NewError は新しいアプリケーションエラーを作成する
func NewError(code ErrorCode, message string, err error) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
		Err:     err,
	}
}

// ErrorHandler はエラーハンドラーを返す
func ErrorHandler() echo.HTTPErrorHandler {
	return func(err error, c echo.Context) {
		var (
			code    = http.StatusInternalServerError
			message = "内部サーバーエラーが発生しました"
			errCode = ErrorCodeInternal
		)

		if he, ok := err.(*echo.HTTPError); ok {
			// Echoのエラー
			code = he.Code
			message = fmt.Sprintf("%v", he.Message)

			switch code {
			case http.StatusNotFound:
				errCode = ErrorCodeNotFound
			case http.StatusBadRequest:
				errCode = ErrorCodeInvalidRequest
			case http.StatusUnauthorized:
				errCode = ErrorCodeUnauthorized
			case http.StatusForbidden:
				errCode = ErrorCodeForbidden
			}
		} else if ae, ok := err.(*AppError); ok {
			// アプリケーションエラー
			errCode = ae.Code
			message = ae.Message

			switch ae.Code {
			case ErrorCodeInvalidRequest:
				code = http.StatusBadRequest
			case ErrorCodeNotFound:
				code = http.StatusNotFound
			case ErrorCodeUnauthorized:
				code = http.StatusUnauthorized
			case ErrorCodeForbidden:
				code = http.StatusForbidden
			case ErrorCodeUnsupportedFormat, ErrorCodeFileTooLarge:
				code = http.StatusBadRequest
			}
		}

		// エラーレスポンスを返す
		if !c.Response().Committed {
			if c.Request().Method == http.MethodHead {
				c.NoContent(code)
			} else {
				c.JSON(code, model.ErrorResponse{
					Error:   http.StatusText(code),
					Message: message,
					Code:    int(errCode),
				})
			}
		}
	}
}
