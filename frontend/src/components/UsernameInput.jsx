function UsernameInput({
  username,
  setUsername
}) {

  return (
    <>
      <input
        type="text"
        placeholder="Enter Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />

      <br />
      <br />
    </>
  );

}

export default UsernameInput;