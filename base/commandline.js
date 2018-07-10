class CommandLine {
    constructor(config) {
        this.config = config;
    }

    parse() {
        let config = this.config;

        let last = 2;
        for (let i = 2; i < process.argv.length; i++) {
            for (let key in config) {
                if (process.argv[i] === ("-" + key)) {
                    let next = process.argv[i + 1];
                    if (next == null || next.startsWith('-')) {
                        //console.log(next,next.startsWith('-'));
                        config[key] = true;
                    } else {
                        config[key] = next;
                        i++;
                    }
                    
                    last = i;
                }
            }
        }

        config.arguments = process.argv.slice(last + 1).join(' ');

        return this.config;
    }
}

module.exports = {
    CommandLine
};