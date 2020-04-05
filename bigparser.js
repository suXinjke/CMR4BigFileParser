const fs = require( 'fs' ).promises
const path = require( 'path' )

function parseHeader( file = Buffer.alloc() ) {
    const magic = file.slice( 0, 4 ).toString('utf8')
    if (magic !== 'BIGF') {
        throw new Error( 'Missing BIGF magic header, not a big file' )
    }
    const file_amount = file.readUInt32LE( 4 )

    return {
        file_amount,
        files_offset: file.readUInt32LE( 8 ),

        files: [ ...new Array( file_amount ) ].map( ( _, index ) => {
            const offset = 0x24 + index * 0x18

            return {
                name: file.slice( offset, offset + 0x10 ).filter( chr => chr !== 0 ).toString(),
                size: file.readUInt32LE( offset + 0x10 ),
                offset: file.readUInt32LE( offset + 0x14 )
            }
        } )
    }
}

const helpMessage =
`Colin McRae Rally 04 BIG File extraction and WAV file deciphering tool
Extracts the contents of BIG files and deciphers extracted WAV files

node big_parser.js [OPTIONS] <big_files_directory> <output_directory>

List of options:
    --no-deciphering       Do not decipher the extracted WAV files with wav-key.bin
`

async function main() {
    if ( process.argv.length < 4 ) {
        console.log( helpMessage )
        return
    }

    const [ big_files_directory, output_directory ] = process.argv.slice( -2 )

    const wav_key = process.argv.includes( '--no-deciphering' ) == false ?
        await fs.readFile( './wav-key.bin' ) :
        null

    await fs.mkdir( output_directory, { recursive: true } )

    const big_file_names = await fs.readdir( big_files_directory )

    await Promise.all( big_file_names.map( async big_file_name => {
        const directory_name = path.parse( big_file_name ).name
        await fs.mkdir( path.join( output_directory, directory_name ), { recursive: true } )

        const big_file = await fs.readFile( path.join( big_files_directory, big_file_name ) )

        try {
            const { files_offset, files } = parseHeader( big_file )

            await Promise.all( files.map( async file => {
                const wav_file = big_file.slice(
                    files_offset + file.offset,
                    files_offset + file.offset + file.size
                )

                if ( wav_key ) {
                    for ( let i = 0 ; i < wav_file.length ; i++ ) {
                        wav_file[i] = wav_file[i] ^ wav_key[i % wav_key.length]
                    }
                }

                await fs.writeFile(
                    path.join( output_directory, directory_name, `${directory_name}_${file.name}` ),
                    wav_file
                )
            } ) )

            console.log( `${big_file_name}: extracted` )
        } catch ( err ) {
            console.log( `${big_file_name}: ${err.message}, skipping` )
        }
    } ) )
}

(async () => {
    try {
        await main();
    } catch ( e ) {
        console.log( e.stack )
    }
})()