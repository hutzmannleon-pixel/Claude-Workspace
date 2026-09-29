#!/bin/bash
# Start-Check mit den echten Server-Einstellungen (ändert nichts):  sudo /opt/kaminfeger/app/deploy/launch-check.sh
exec systemd-run --quiet --wait --pipe --collect -p EnvironmentFile=/etc/kaminfeger.env -p User=kaminfeger -p WorkingDirectory=/opt/kaminfeger/app \
  /opt/node/bin/node --disable-warning=ExperimentalWarning server/launch.js check
