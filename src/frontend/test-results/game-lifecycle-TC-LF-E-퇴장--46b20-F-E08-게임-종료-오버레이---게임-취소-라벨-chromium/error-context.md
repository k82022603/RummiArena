# Page snapshot

```yaml
- generic [active]:
  - alert [ref=e1]
  - dialog "게임 종료" [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]: ❌
        - heading "게임 취소" [level=2] [ref=e6]
        - paragraph [ref=e7]: 게임이 취소되었어요.
      - button "로비로 돌아가기" [ref=e8] [cursor=pointer]
  - status [ref=e9]
```