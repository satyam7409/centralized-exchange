
const signup = ()=>{
  // const { username, password } = req.body;
  const { username, password } = req.body;
  // 1. check username not taken
  const alreadyExist = users.some((x) => x.userName === username);
  if (alreadyExist) {
    throw new Error("Username already exist");
  }
  // 2. hash password (bcrypt/argon2)

  //   const hash = bcrypt.hashSync(password, 10);
  // 3. push to USERS
  users.push({
    id: uuidv4(),
    userName: username,
    balance: { total: 0, locked: 0, stocks: {} },
  });
  console.log("Users", users);
  // 4. init BALANCES[userId] with INR: { available: 0, locked: 0 }
}

app.post("/login", (req, res) => {
  // 1. find user by username
  // 2. compare hashed password
  // 3. return JWT / session token
});
