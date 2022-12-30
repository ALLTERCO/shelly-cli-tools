def duration($limit; $separator; $default):
  if type != "number" then
    $default
  else
    . as $value
    | [[31536000, "y"], [86400, "d"], [3600, "h"], [60, "m"], [1, "s"]]
    | [label $out | foreach .[] as $item (
        [$value, 1];
        if $limit > 0 and .[1] > $limit then
          break $out
        elif .[0] >= $item[0] then
          [.[0] % $item[0], .[1] + 1] + [(.[0] / $item[0] | floor | tostring) + $item[1]]
        else
          .[0:2]
        end;
        if length > 2 then
          .[2]
        else
          empty
        end)
      ]
    | if length > 0 then join($separator) else "0s" end
  end;

def duration($limit; $separator): duration($limit; $separator; "-");
def duration($limit): duration($limit; " "; "-");
def duration: duration(0; " "; "-");