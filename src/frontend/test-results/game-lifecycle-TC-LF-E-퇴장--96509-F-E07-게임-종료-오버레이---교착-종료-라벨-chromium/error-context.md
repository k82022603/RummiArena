# Page snapshot

```yaml
- generic [active]:
  - alert [ref=e1]
  - dialog "게임 종료" [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]: 🤝
        - heading "교착 종료" [level=2] [ref=e6]
        - paragraph [ref=e7]: QA-테스터 승리!
        - paragraph [ref=e8]: 모든 플레이어가 연속으로 패스해 교착 상태로 종료되었어요.
        - paragraph [ref=e9]: 잔여 타일 점수 기준으로 승자가 결정되었습니다.
      - table "게임 결과" [ref=e11]:
        - rowgroup [ref=e12]:
          - row "플레이어 남은 타일 결과" [ref=e13]:
            - columnheader "플레이어" [ref=e14]
            - columnheader "남은 타일" [ref=e15]
            - columnheader "결과" [ref=e16]
        - rowgroup [ref=e17]:
          - row "QA-테스터 1장 승" [ref=e18]:
            - cell "QA-테스터" [ref=e19]
            - cell "1장" [ref=e20]
            - cell "승" [ref=e21]
          - row "shark (GPT-4o) 3장 패" [ref=e22]:
            - cell "shark (GPT-4o)" [ref=e23]
            - cell "3장" [ref=e24]
            - cell "패" [ref=e25]
      - button "로비로 돌아가기" [ref=e26] [cursor=pointer]
  - status [ref=e27]
```