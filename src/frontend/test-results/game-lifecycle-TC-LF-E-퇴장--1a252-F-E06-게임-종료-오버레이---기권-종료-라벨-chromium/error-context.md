# Page snapshot

```yaml
- generic [active]:
  - alert [ref=e1]
  - dialog "게임 종료" [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]: 🏳️
        - heading "기권 종료" [level=2] [ref=e6]
        - paragraph [ref=e7]: QA-테스터 승리!
        - paragraph [ref=e8]: 한 플레이어의 기권으로 게임이 종료되었어요.
      - table "게임 결과" [ref=e10]:
        - rowgroup [ref=e11]:
          - row "플레이어 남은 타일 결과" [ref=e12]:
            - columnheader "플레이어" [ref=e13]
            - columnheader "남은 타일" [ref=e14]
            - columnheader "결과" [ref=e15]
        - rowgroup [ref=e16]:
          - row "QA-테스터 1장 승" [ref=e17]:
            - cell "QA-테스터" [ref=e18]
            - cell "1장" [ref=e19]
            - cell "승" [ref=e20]
          - row "shark (GPT-4o)(기권) 2장 기권" [ref=e21]:
            - cell "shark (GPT-4o)(기권)" [ref=e22]
            - cell "2장" [ref=e23]
            - cell "기권" [ref=e24]
      - button "로비로 돌아가기" [ref=e25] [cursor=pointer]
  - status [ref=e26]
```