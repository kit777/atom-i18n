'use strict'

const argv = require('yargs')
  .example('$ npm run validation', 'validate cson of all locales')
  .example('$ npm run validation -- --locale fr zh-tw', 'validate cson in fr/* and zh-tw/*')
  .array('locale')
  .describe('locale', 'specify list of locales')
  .help('h')
  .argv

const fs = require('fs')
const path = require('path')
const CSON = require('cson')
const { expect } = require('chai')

const { flattenObj } = require('./util.js')
const LOCALES = require('./locales.js')
const CsonFiles = require('./defs.js')

const ATOMVERSION = 'v1.19.0'

describe('validation', () => {

  describe('package.json validation', () => {
    let packageMeta = {}

    it('loads package.json', () => {
      const loading = () => {
        packageMeta = JSON.parse(fs.readFileSync('./package.json'), 'utf8')
      }
      expect(loading).not.to.throw(Error, 'load package.json error')
    })
    // NOTE WIP PROGRESS BAR

    it('checks locale options list in configSchema in package.json', () => {
      const locales = packageMeta.configSchema.locale.enum.map(opt => opt.value)
      expect(locales, 'inconsistent locale options').to.deep.equal(LOCALES)
    })
  })

  describe('cson file validation', () => {

    describe('checking template/settings.cson `controls.*._id` according atom config-schema.js', () => {

      it('compares keys with flatten config-schema.js', done => {
        const neverShownDesciptionInSettingsPanelItems = [
          'core.customFileTypes',
          'core.disabledPackages',
          'core.themes',
          'editor.commentEnd',
          'editor.commentStart',
          'editor.decreaseIndentPattern',
          'editor.foldEndPattern',
          'editor.increaseIndentPattern',
          'editor.invisibles',   // NOTE shows only editor.invisibles.*
        ]    // NOTE Manually updated exceptional list from https://github.com/atom/settings-view/blob/master/lib/settings-panel.js#L339-L350

        const templateSettingsControls = CSON.load(path.join(__dirname, '../def/template', 'settings.cson'))
          .Settings.settings.controls.map(({ _id }) => _id)

        const axios = require('axios')
        const configURL = `https://raw.githubusercontent.com/atom/atom/${ATOMVERSION}/src/config-schema.js`
        axios.get(configURL).then(({ data }) => {
          try {
            const srcConfig = eval(data)
            const flattenSrcConfigKeys = Object.keys(flattenObj(srcConfig))
              .filter(key => key.search(/enum/g) === -1)
              .filter(key => key.search(/description$/g) > -1)
              .map(key => key.replace(/\.properties/g, '').replace(/\.description/g, ''))

            expect(templateSettingsControls.concat(neverShownDesciptionInSettingsPanelItems))
              .to.include.members(flattenSrcConfigKeys, 'inconsistent keys')
            // NOTE expect all interested keys in `flattenSrcConfigKeys` appears in templateSettingsControls
            done()
          } catch (err) {
            done(err)  // handle assertion fails error, to avoid test timeout
          }
        }, done)    // should always run done() when promise-resolved, assertion-fail-error, promise-rejected
      })
    })

    describe('checking each cson files of all locales', () => {
      const templateKeys = {}
      CsonFiles.forEach(csonFile => {
        templateKeys[csonFile] = Object.keys(flattenObj(CSON.load(path.join(__dirname, '../def/template', csonFile))))
      })

      const locales = argv.locale || LOCALES
      locales.forEach(locale => {

        describe(`checking locale ${locale}`, () => {

          CsonFiles.forEach(csonFile => {

            describe(`checking "${path.join(locale, csonFile)}"`, () => {

              const cson = CSON.load(path.join(__dirname, '../def', locale, csonFile))
              const flattenCson = flattenObj(cson)

              it('has no error loading cson', () => {
                expect(cson, 'load cson error').not.to.be.instanceof(Error)
              })
              it('has consistent flatten keys with template', () => {
                expect(Object.keys(flattenCson), 'inconsistent keys').to.deep.equal(templateKeys[csonFile])
              })
              it('has no special char in values of cson', () => {
                Object.keys(flattenCson).forEach(k => {
                  const specialChr = /[~@#%^*]/g
                  const _str = flattenCson[k].toString()
                  const _res = _str.search(specialChr)
                  const errMsg = `\n\tfound special chr: '${_str[_res]}' in value: '${_str}'\n\n\tcson-path: '${k}'\t`
                  expect(_res, errMsg).to.equal(-1)
                })
              })
              if (csonFile === 'menu_linux.cson' || csonFile === 'menu_win32.cson') {
                it('has valid hotkey hints if required', () => {
                  Object.keys(flattenCson).forEach(k => {
                    const menuItemName = k.split('.').slice(-2, -1).shift()
                    const _str = flattenCson[k]
                    const hasAmpersand = menuItemName.match(/&/g)
                    if (hasAmpersand) {
                      const hotkeyHintRegex = /&\w/g
                      const errMsg = `\n\tinvalid or missing hotkey hint in '${_str}'\n\n\tcson-path: '${k}'\t`
                      expect(_str.search(hotkeyHintRegex), errMsg).to.not.equal(-1)
                    }
                  })
                })
              }

            })
          })
        })
      })   // end of each locale of locales

    })   // end of checking each cson files of all locales

  })   // end of cson file validation

})   // end of validation
