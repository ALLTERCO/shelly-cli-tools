#!/bin/bash
#Create CSV file with ADE7880 gain values from saved Shelly config JSONs
#Run against a directory with reference gains

logpath="${1}/*-gains-*.json"
gainscsv="${1}/gains.csv"
CNT=0
for f in $logpath; do
    if [ "$CNT" -eq "0" ]; then
      echo -n "MAC," >> $gainscsv;
      cat $f | jq -r 'keys_unsorted | join(",")' >> $gainscsv
    fi
    DEVMAC=$(echo $f | sed -E 's/.*([0-9,A-F]{12}).*/\1/')
    echo -n "${DEVMAC}," >> $gainscsv
    cat $f | jq -r 'values | join(",")' >> $gainscsv
    ((CNT+=1))
done
