#!/bin/bash

while true
do
    curl https://app-e2f392d6-88b6-48d8-85f6-46fb5211b218.ingress.apprun.sakura.ne.jp/health
    echo ""
    sleep 10
done
