// seed-finder는 B3 결정론 Playtest 프레임워크에서 사용할 "조건 충족 시드"를
// 탐색하는 일회성 유틸리티다. 각 시나리오가 요구하는 초기 랙 조건을 만족하는
// seed uint64 를 브루트포스로 찾아낸다.
//
// 사용:
//
//	go run ./cmd/seed-finder > seeds.txt
//
// 출력은 JSON Lines 형식이며, 각 줄은 다음과 같다:
//
//	{"scenario":"joker-exchange-v07","seed":"0x...","seat0Hand":[...],"condition":"..."}
//
// 본 툴은 테스트가 아니므로 패키지 바깥에 있다. CI에서 실행되지 않는다.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/k82022603/RummiArena/game-server/internal/engine"
)

type scenarioSpec struct {
	ID        string
	Predicate func(seat0Hand, seat1Hand []*engine.Tile) (bool, string)
}

// hasCode 랙에 특정 code가 있는지 확인한다.
func hasCode(hand []*engine.Tile, code string) bool {
	for _, t := range hand {
		if t.Code == code {
			return true
		}
	}
	return false
}

// countNumberColor 랙에서 (color, number) 조합의 개수를 센다 (a/b 구분 무시).
func countNumberColor(hand []*engine.Tile, color string, number int) int {
	c := 0
	for _, t := range hand {
		if t.Color == color && t.Number == number {
			c++
		}
	}
	return c
}

// findRunLen 동일 색에서 길이 minLen 이상의 연속 숫자 run을 찾는다.
// 반환: 시작 숫자 (없으면 0), 색.
func findRunLen(hand []*engine.Tile, color string, minLen int) (startNum int, found bool) {
	var nums [14]bool
	for _, t := range hand {
		if t.Color == color && t.Number >= 1 && t.Number <= 13 {
			nums[t.Number] = true
		}
	}
	for start := 1; start <= 14-minLen; start++ {
		run := true
		for k := 0; k < minLen; k++ {
			if !nums[start+k] {
				run = false
				break
			}
		}
		if run {
			return start, true
		}
	}
	return 0, false
}

// hasJoker 랙에 JK1 또는 JK2가 있는지.
func hasJoker(hand []*engine.Tile) bool {
	return hasCode(hand, "JK1") || hasCode(hand, "JK2")
}

// hasInitialMeldCandidate 30점 이상 초기 등록이 가능한 조합이 있는지 대략 체크.
// 간단 휴리스틱: (a) 숫자 >=10 인 그룹 3색 이상, 또는 (b) 길이4 이상 run(합 30+)
func hasInitialMeldCandidate(hand []*engine.Tile) bool {
	// (a) 같은 숫자 3색 이상에 숫자>=10
	byNum := map[int]map[string]bool{}
	for _, t := range hand {
		if t.IsJoker {
			continue
		}
		if byNum[t.Number] == nil {
			byNum[t.Number] = map[string]bool{}
		}
		byNum[t.Number][t.Color] = true
	}
	for n, colors := range byNum {
		if n >= 10 && len(colors) >= 3 {
			return true
		}
	}
	// (b) 길이4+ run에서 평균 점수 체크
	for _, color := range []string{"R", "B", "Y", "K"} {
		for minLen := 4; minLen <= 6; minLen++ {
			if start, ok := findRunLen(hand, color, minLen); ok {
				sum := 0
				for k := 0; k < minLen; k++ {
					sum += start + k
				}
				if sum >= 30 {
					return true
				}
			}
		}
	}
	return false
}

// totalTilesInHand 헬퍼: 단순 길이.
func totalTilesInHand(hand []*engine.Tile) int {
	return len(hand)
}

func codeList(hand []*engine.Tile) []string {
	out := make([]string, len(hand))
	for i, t := range hand {
		out[i] = t.Code
	}
	return out
}

func main() {
	scenarios := []scenarioSpec{
		{
			ID: "joker-exchange-v07",
			Predicate: func(h0, h1 []*engine.Tile) (bool, string) {
				// 조커 최소 1장 + 초기 등록 가능 휴리스틱
				if !hasJoker(h0) {
					return false, ""
				}
				if !hasInitialMeldCandidate(h0) {
					return false, ""
				}
				return true, "joker in rack + initial meld feasible"
			},
		},
		{
			ID: "rearrange-v13-type3",
			Predicate: func(h0, h1 []*engine.Tile) (bool, string) {
				// 런 4매 이상 가능 (경계 타일은 draw pile에서 나오면 됨)
				for _, color := range []string{"R", "B", "Y", "K"} {
					if start, ok := findRunLen(h0, color, 4); ok {
						return true, fmt.Sprintf("%s run start=%d len>=4", color, start)
					}
				}
				return false, ""
			},
		},
		{
			ID: "rearrange-classify-mixed-numbers",
			Predicate: func(h0, h1 []*engine.Tile) (bool, string) {
				// 혼합 숫자 false positive 재현: 같은 색 연속 숫자 2개 + 다른 색 같은 숫자 1개
				// 예: R5, R6, B5 → classify 오분류 위험
				for _, color := range []string{"R", "B", "Y", "K"} {
					for n := 1; n <= 12; n++ {
						if countNumberColor(h0, color, n) >= 1 &&
							countNumberColor(h0, color, n+1) >= 1 {
							// 같은 숫자를 다른 색으로 보유
							for _, c2 := range []string{"R", "B", "Y", "K"} {
								if c2 == color {
									continue
								}
								if countNumberColor(h0, c2, n) >= 1 {
									return true, fmt.Sprintf("%s%d + %s%d + %s%d",
										color, n, color, n+1, c2, n)
								}
							}
						}
					}
				}
				return false, ""
			},
		},
		{
			ID: "time-penalty-v16",
			Predicate: func(h0, h1 []*engine.Tile) (bool, string) {
				// 아무 랙이나 유효 (타임아웃은 랙 상태 무관)
				return true, "any rack"
			},
		},
		{
			ID: "conservation-106",
			Predicate: func(h0, h1 []*engine.Tile) (bool, string) {
				// 아무 랙이나 유효 (보존 불변식은 초기 분배 직후 항상 만족)
				return true, "any rack"
			},
		},
	}

	type out struct {
		Scenario  string   `json:"scenario"`
		Seed      string   `json:"seed"`
		Seat0Hand []string `json:"seat0Hand"`
		Condition string   `json:"condition"`
	}

	const maxSeeds = 200_000
	perScenarioLimit := 3
	found := map[string]int{}

	for seed := uint64(1); seed <= maxSeeds; seed++ {
		pool := engine.NewTilePoolWithSeed(seed)
		hands, err := pool.DealInitialHands(2)
		if err != nil {
			continue
		}
		for _, sc := range scenarios {
			if found[sc.ID] >= perScenarioLimit {
				continue
			}
			ok, cond := sc.Predicate(hands[0], hands[1])
			if !ok {
				continue
			}
			o := out{
				Scenario:  sc.ID,
				Seed:      fmt.Sprintf("0x%X", seed),
				Seat0Hand: codeList(hands[0]),
				Condition: cond,
			}
			b, _ := json.Marshal(o)
			fmt.Println(string(b))
			found[sc.ID]++
		}
		done := true
		for _, sc := range scenarios {
			if found[sc.ID] < perScenarioLimit {
				done = false
				break
			}
		}
		if done {
			break
		}
	}

	// stderr에 요약
	summary := []string{}
	for _, sc := range scenarios {
		summary = append(summary, fmt.Sprintf("%s:%d/%d", sc.ID, found[sc.ID], perScenarioLimit))
	}
	fmt.Fprintf(os.Stderr, "summary: %s\n", strings.Join(summary, " "))
}
