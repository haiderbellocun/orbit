(function() {
    var pressedKeys = {};

    function setKey(event, status) {
        var code = event.keyCode;
        var key;

        switch(code) {
        case 32:
            key = 'SPACE'; break;
        case 65:
        case 37:
            key = 'LEFT'; break;
        case 87:
        case 38:
            key = 'UP'; break;
        case 68:
        case 39:
            key = 'RIGHT'; break;
        case 83:
        case 40:
            key = 'DOWN'; break;
        case 88:
            key = 'JUMP'; break;
        case 90:
            key = 'RUN'; break;
        default:
            key = String.fromCharCode(code);
        }

        pressedKeys[key] = status;
        return key === 'LEFT' || key === 'RIGHT' || key === 'UP' ||
            key === 'DOWN' || key === 'JUMP' || key === 'RUN' || key === 'SPACE';
    }

    document.addEventListener('keydown', function(e) {
        if (setKey(e, true)) e.preventDefault();
    });

    document.addEventListener('keyup', function(e) {
        if (setKey(e, false)) e.preventDefault();
    });

    window.addEventListener('blur', function() {
        pressedKeys = {};
    });

    window.input = {
        isDown: function(key) {
            return pressedKeys[key.toUpperCase()];
        },
        reset: function() {
          pressedKeys['RUN'] = false;
          pressedKeys['LEFT'] = false;
          pressedKeys['RIGHT'] = false;
          pressedKeys['DOWN'] = false;
          pressedKeys['JUMP'] = false;
        }
    };
})();
