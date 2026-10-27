#!/bin/sh
cd "$(dirname "$0")" || exit 1
sh ./start.sh
status=$?
[ $status -ne 0 ] && { echo; echo "起動に失敗しました。Enter キーで閉じます。"; read _; }
exit $status
