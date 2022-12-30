#!/bin/sh

if [ $# -eq 0 ]
  then
    echo "Provide Shelly IP as argument"
    exit 1;
fi

SHELLY=${1}
JQUERY="import \"./bin/duration\" as dur; \"uptime \" + (.result.sys.uptime | dur::duration(2)) + \" free mem \" + (.result.sys.ram_free | tostring)"

while :;
do 
    curl -s -X POST -d '{"id":1,"method":"shelly.getstatus"}' http://${SHELLY}/rpc | jq -L . "${JQUERY}"; sleep 0.5; 
done