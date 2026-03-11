# RummiArena 프로젝트용 WSL2 설정
# K8s + 앱 서비스 + ArgoCD + SonarQube(가끔) 기준
# 최대 부하: ~7.5GB → 10GB 할당으로 여유 확보
[wsl2]
memory=10GB
swap=4GB
processors=6

[experimental]
autoMemoryReclaim=dropcache
sparseVhd=true
