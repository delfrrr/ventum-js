ventum.js
======
main libraries and engine for node.js

install
------
    mkdir -p node_modules

or

    ln -s /usr/lib/node_modules .

then

    git clone git@github.com:delfrrr/ventum-js.git node_modules/ventum

usage
-----
```
var Lib = require('ventum');
var someModule = Lib('someModule');
```

creating your module
------

in folder ```libs``` create file ```module.js```


```
exports.instance = function () {
  var Module = function () {
    
  }
  Module.prototype = {
    foo: function () {
      return 'bar'
    }
  }
  return Module;
}
```

in your service:

```
var Lib = require('ventum'),
  module = Lib('module');
console.log(module.foo());
```

will output:

    bar

