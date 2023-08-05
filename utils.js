const Utils = (function() {
    /**
     * COnvert file data length to Megabyte
     * @param {number} i 
     * @returns 
     */
    function toMb(i) {
        return (i / 1024 / 1024).toFixed(2);
    }

    // return method to Utils
    return {
        toMb
    }
})();

module.exports = Utils