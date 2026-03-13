package service

import "fmt"

// ServiceError 서비스 레이어에서 발생하는 에러.
// HTTP 핸들러는 이 타입을 type assertion으로 확인하여 적절한 상태 코드를 반환한다.
type ServiceError struct {
	Code    string // API 에러 코드 (ex. "NOT_FOUND", "ROOM_FULL")
	Message string // 사용자 표시용 한글 메시지
	Status  int    // 권장 HTTP 상태 코드
}

func (e *ServiceError) Error() string {
	return fmt.Sprintf("service error [%s] %s", e.Code, e.Message)
}

// IsServiceError 에러가 ServiceError 타입인지 확인하고 캐스팅한다.
func IsServiceError(err error) (*ServiceError, bool) {
	if err == nil {
		return nil, false
	}
	se, ok := err.(*ServiceError)
	return se, ok
}
