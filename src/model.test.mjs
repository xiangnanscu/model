import Field from '@xiangnanscu/field'
import Modelsql from '@xiangnanscu/modelsql'
import Model from './model.mjs'


const User = {
  tableName: 'usr',
  fieldNames: ['id', 'name'],
  nameCache: {
    id: "id",
    name: "name"
  },
  fields: {
    id: { name: 'id' },
    name: { name: 'name' }
  }
}
class UserSql extends Sql {
  model = User
  tableName = User.tableName
}


// console.log(UserSql.new().validate(false).insert({ "id": 1, "name": "foo" }).statement())

test('select', () => {
  expect(1).toBe(1)
});